"""Assessment API checks with an in-memory repository and a faked identity.

Run: cd apps/backend && python -m pytest tests/test_assessment_api.py -v
"""

import pytest
from fastapi.testclient import TestClient

from app.api.dependencies.auth import get_current_claims
from app.features.assessment.repository import AssessmentStoreError
from app.features.assessment.router import get_assessment_repo
from app.features.auth.router import limiter
from app.main import app

USER_A = "11111111-1111-4111-8111-111111111111"
USER_B = "22222222-2222-4222-8222-222222222222"

BASE = "/api/v1/assessment"


class FakeRepo:
    def __init__(self) -> None:
        self.answers: dict[str, dict[int, int]] = {}
        self.results: dict[str, list] = {}
        self.profiles: dict[str, dict] = {}

    async def save_answer(self, user_id, question_id, response):
        self.answers.setdefault(user_id, {})[question_id] = response

    async def get_answers(self, user_id):
        return dict(self.answers.get(user_id, {}))

    async def save_result(self, user_id, score, money_why):
        self.results.setdefault(user_id, []).append(score)
        self.profiles[user_id] = {"archetype": score.primary, "money_why": money_why}

    async def get_latest_result(self, user_id):
        history = self.results.get(user_id)
        return history[-1] if history else None


class BrokenRepo:
    async def get_answers(self, user_id):
        raise AssessmentStoreError("Assessment service unavailable.")


def _client(repo, user: str = USER_A) -> TestClient:
    app.dependency_overrides[get_assessment_repo] = lambda: repo
    app.dependency_overrides[get_current_claims] = lambda: {"sub": user}
    return TestClient(app)


@pytest.fixture(autouse=True)
def _isolate():
    # Limits are per client IP and the counters live in process memory, so other
    # tests would otherwise eat this file's budget (and vice versa).
    limiter.enabled = False
    yield
    app.dependency_overrides.clear()
    limiter.enabled = True
    limiter.reset()


def _answer_all(client: TestClient, value: int = 3) -> None:
    for question_id in range(1, 19):
        response = client.put(f"{BASE}/answers/{question_id}", json={"response": value})
        assert response.status_code == 204


# -- authentication --------------------------------------------------------


def test_every_route_requires_a_token():
    app.dependency_overrides[get_assessment_repo] = lambda: FakeRepo()
    with TestClient(app) as client:
        assert client.get(f"{BASE}/progress").status_code == 401
        assert client.get(f"{BASE}/result").status_code == 401
        assert client.put(f"{BASE}/answers/1", json={"response": 3}).status_code == 401
        assert client.post(f"{BASE}/complete", json={"money_why": "peace"}).status_code == 401


def test_a_token_subject_that_is_not_a_uuid_is_rejected():
    with _client(FakeRepo(), user="1;drop table users") as client:
        assert client.get(f"{BASE}/progress").status_code == 401


# -- answers ---------------------------------------------------------------


def test_answers_are_saved_and_overwritten_per_question():
    repo = FakeRepo()
    with _client(repo) as client:
        assert client.put(f"{BASE}/answers/7", json={"response": 2}).status_code == 204
        assert client.put(f"{BASE}/answers/7", json={"response": 5}).status_code == 204
        assert client.put(f"{BASE}/answers/8", json={"response": 1}).status_code == 204
        body = client.get(f"{BASE}/progress").json()

    assert body == {
        "answers": [
            {"question_id": 7, "response": 5},
            {"question_id": 8, "response": 1},
        ]
    }


@pytest.mark.parametrize("bad", [0, 6, -1, "3", 3.5, True, None])
def test_out_of_range_or_mistyped_responses_are_rejected(bad):
    with _client(FakeRepo()) as client:
        response = client.put(f"{BASE}/answers/1", json={"response": bad})
    assert response.status_code == 422


@pytest.mark.parametrize("bad", ["0", "19", "-1", "abc"])
def test_question_ids_outside_1_to_18_are_rejected(bad):
    with _client(FakeRepo()) as client:
        response = client.put(f"{BASE}/answers/{bad}", json={"response": 3})
    assert response.status_code == 422


def test_unknown_fields_are_rejected():
    with _client(FakeRepo()) as client:
        response = client.put(f"{BASE}/answers/1", json={"response": 3, "user_id": USER_B})
    assert response.status_code == 422


# -- complete / result -----------------------------------------------------


def test_complete_with_missing_answers_is_a_409_and_stores_nothing():
    repo = FakeRepo()
    with _client(repo) as client:
        for question_id in range(1, 18):
            client.put(f"{BASE}/answers/{question_id}", json={"response": 3})
        response = client.post(f"{BASE}/complete", json={"money_why": "peace"})

    assert response.status_code == 409
    assert USER_A not in repo.results


def test_complete_scores_on_the_server_and_updates_the_profile():
    repo = FakeRepo()
    with _client(repo) as client:
        _answer_all(client, 4)
        response = client.post(f"{BASE}/complete", json={"money_why": "freedom"})

    assert response.status_code == 200
    body = response.json()
    slugs = {body["primary"]["slug"], body["secondary"]["slug"], body["tertiary"]["slug"]}
    assert len(slugs) == 3
    assert len(body["dimensions"]) == 6
    assert set(body["bands"].values()) <= {"very_low", "low", "moderate", "high", "very_high"}
    assert "similarit" not in response.text
    assert repo.profiles[USER_A] == {"archetype": body["primary"]["slug"], "money_why": "freedom"}


@pytest.mark.parametrize("payload", [{}, {"money_why": "wealth"}, {"money_why": "peace", "x": 1}])
def test_complete_rejects_bad_money_why(payload):
    with _client(FakeRepo()) as client:
        assert client.post(f"{BASE}/complete", json=payload).status_code == 422


def test_complete_twice_is_safe_and_returns_the_same_archetype():
    repo = FakeRepo()
    with _client(repo) as client:
        _answer_all(client, 2)
        first = client.post(f"{BASE}/complete", json={"money_why": "peace"})
        second = client.post(f"{BASE}/complete", json={"money_why": "peace"})

    assert first.status_code == second.status_code == 200
    assert first.json()["primary"]["slug"] == second.json()["primary"]["slug"]


def test_result_is_404_until_complete_then_matches():
    repo = FakeRepo()
    with _client(repo) as client:
        assert client.get(f"{BASE}/result").status_code == 404
        _answer_all(client, 5)
        completed = client.post(f"{BASE}/complete", json={"money_why": "control"}).json()
        assert client.get(f"{BASE}/result").json() == completed


def test_result_response_has_computed_at():
    repo = FakeRepo()
    with _client(repo) as client:
        _answer_all(client, 5)
        assert client.post(f"{BASE}/complete", json={"money_why": "control"}).json()["computed_at"]
        assert client.get(f"{BASE}/result").json()["computed_at"]


def test_one_user_never_sees_another_users_data():
    repo = FakeRepo()
    with _client(repo, USER_A) as client:
        _answer_all(client)
        client.post(f"{BASE}/complete", json={"money_why": "peace"})

    with _client(repo, USER_B) as client:
        assert client.get(f"{BASE}/progress").json() == {"answers": []}
        assert client.get(f"{BASE}/result").status_code == 404
        assert client.post(f"{BASE}/complete", json={"money_why": "peace"}).status_code == 409


# -- failure and abuse -----------------------------------------------------


def test_store_failure_is_a_generic_503():
    with _client(BrokenRepo()) as client:
        response = client.get(f"{BASE}/progress")

    assert response.status_code == 503
    assert response.json() == {"detail": "Assessment service unavailable."}


def test_complete_is_rate_limited_to_ten_per_hour():
    limiter.enabled = True
    limiter.reset()
    with _client(FakeRepo()) as client:
        statuses = [
            client.post(f"{BASE}/complete", json={"money_why": "peace"}).status_code
            for _ in range(11)
        ]

    assert statuses[:10] == [409] * 10
    assert statuses[10] == 429
