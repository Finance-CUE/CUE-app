"""The ten CUE archetypes: target ranges (from `archetype logic.docx`) and result copy.

Matching uses the midpoint of each range as the archetype's fingerprint vector.
Order here is the tie-break order, so do not reorder casually.
"""

from dataclasses import dataclass

DIMENSIONS = (
    "present_bias",
    "future_orientation",
    "identity",
    "financial_avoidance",
    "family_influence",
    "financial_agency",
)

Range = tuple[int, int]


@dataclass(frozen=True)
class Archetype:
    slug: str
    name: str
    description: str
    strengths: tuple[str, str]
    blind_spots: tuple[str, str]
    ranges: dict[str, Range]

    @property
    def vector(self) -> tuple[float, ...]:
        return tuple((low + high) / 2 for low, high in (self.ranges[d] for d in DIMENSIONS))


def _ranges(pb: Range, fo: Range, ident: Range, av: Range, fi: Range, ag: Range) -> dict[str, Range]:
    return dict(zip(DIMENSIONS, (pb, fo, ident, av, fi, ag), strict=True))


ARCHETYPES: tuple[Archetype, ...] = (
    Archetype(
        slug="dreamer",
        name="The Dreamer",
        description=(
            "You see the life you want before you see the budget for it. Money is a doorway to "
            "possibility, and your vision is vivid. The plan is where things tend to drift."
        ),
        strengths=("Imagines meaningful goals", "Stays hopeful and driven"),
        blind_spots=("Plans more than you act", "Buys for your future self"),
        ranges=_ranges((40, 60), (85, 100), (80, 100), (40, 60), (20, 50), (50, 70)),
    ),
    Archetype(
        slug="comfort_spender",
        name="The Comfort Spender",
        description=(
            "You view money as a tool for immediate relief, comfort, and safety. When stressed or "
            "fatigued, you seek tiny rewards to cope. It is a gentle mechanism of care."
        ),
        strengths=("Generous with others", "Bounces back quickly"),
        blind_spots=("Spends to skip feelings", "Under-tracks small buys"),
        ranges=_ranges((80, 100), (20, 45), (50, 70), (50, 70), (40, 60), (30, 50)),
    ),
    Archetype(
        slug="social_spender",
        name="The Social Spender",
        description=(
            "For you, money is a way to show up for people. You spend with and for the people you "
            "love, and the norms you grew up with quietly guide what feels right."
        ),
        strengths=("Generous and thoughtful", "Builds strong connections"),
        blind_spots=("Spends to keep up socially", "Family norms steer choices"),
        ranges=_ranges((50, 70), (50, 65), (70, 90), (20, 40), (80, 100), (50, 70)),
    ),
    Archetype(
        slug="thrill_chaser",
        name="The Thrill Chaser",
        description=(
            "You chase novelty and live for experiences. You decide fast, you are comfortable with "
            "risk, and money often feels like fuel for the next adventure."
        ),
        strengths=("Confident taking action", "Open to new experiences"),
        blind_spots=("Impulse over planning", "Little cushion for surprises"),
        ranges=_ranges((85, 100), (40, 60), (50, 70), (20, 40), (20, 40), (70, 90)),
    ),
    Archetype(
        slug="prepared_one",
        name="The Prepared One",
        description=(
            "You like a plan and you follow it. Routines, buffers and steady habits make money "
            "feel calm, and you rarely let impulse make the call."
        ),
        strengths=("Consistent saving routines", "Calm under pressure"),
        blind_spots=("May overlook joyful spending", "Rigid when plans change"),
        ranges=_ranges((0, 30), (90, 100), (50, 70), (0, 20), (40, 60), (90, 100)),
    ),
    Archetype(
        slug="optimizer",
        name="The Optimizer",
        description=(
            "You treat money like a system worth improving. You enjoy the data, tweak the details, "
            "and keep refining until it works a little better."
        ),
        strengths=("Analytical and data-driven", "Always improving systems"),
        blind_spots=("Over-tunes small details", "Perfect can delay good enough"),
        ranges=_ranges((20, 40), (75, 90), (40, 60), (0, 20), (20, 40), (90, 100)),
    ),
    Archetype(
        slug="outrunner",
        name="The Outrunner",
        description=(
            "You are building upward. Ambitious and future-focused, you set bigger goals, take "
            "calculated risks, and measure progress by your trajectory."
        ),
        strengths=("Ambitious and driven", "Takes calculated risks"),
        blind_spots=("Always chasing the next goal", "Can overlook the present"),
        ranges=_ranges((40, 60), (90, 100), (70, 90), (20, 40), (20, 40), (85, 100)),
    ),
    Archetype(
        slug="curator",
        name="The Curator",
        description=(
            "Your money follows your values. You spend with intention, care little for trends, and "
            "trust a strong inner compass about what is worth it."
        ),
        strengths=("Intentional with spending", "Trusts your own values"),
        blind_spots=("Values can justify big buys", "May skip the numbers"),
        ranges=_ranges((40, 60), (70, 85), (90, 100), (20, 40), (50, 70), (70, 90)),
    ),
    Archetype(
        slug="autopilot",
        name="The Autopilot",
        description=(
            "Your money mostly runs on habit rather than decisions. Things get paid and life goes "
            "on, but you rarely stop to look at the bigger picture."
        ),
        strengths=("Low-stress about money", "Steady, habit-based routines"),
        blind_spots=("Rarely reviews finances", "Habits go unquestioned"),
        ranges=_ranges((50, 70), (30, 50), (20, 40), (70, 90), (40, 60), (20, 40)),
    ),
    Archetype(
        slug="survival_saver",
        name="The Survival Saver",
        description=(
            "Security comes first. You build buffers, avoid risk, and prepare for the worst so "
            "that uncertainty feels survivable."
        ),
        strengths=("Builds strong safety buffers", "Prepared for surprises"),
        blind_spots=("Can under-spend on joy", "Worry may outweigh progress"),
        ranges=_ranges((0, 20), (80, 95), (30, 50), (40, 60), (70, 90), (50, 70)),
    ),
)

ARCHETYPES_BY_SLUG = {archetype.slug: archetype for archetype in ARCHETYPES}
