"""Archetype booklet context for nudges."""


def load_archetype_context(slug: str | None) -> str | None:
    """Return the booklet text for an archetype slug, or None.

    This is where the archetype booklet loads once it exists. The router passes the
    result to `build_plan`, which puts it on `NudgeContext.booklet` for rules to use.
    """
    return None
