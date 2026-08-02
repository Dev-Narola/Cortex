from typing import Any

from sqlalchemy.orm import Query


def paginate(query: Query, page: int = 1, page_size: int = 10) -> dict[str, Any]:
    """
    Paginate a SQLAlchemy query.

    Args:
        query: SQLAlchemy query object
        page: Page number (1-indexed)
        page_size: Number of items per page

    Returns:
        Dictionary containing pagination metadata and items
    """
    # Validate parameters
    if page < 1:
        page = 1
    if page_size < 1:
        page_size = 10
    # Limit maximum page size to prevent excessive loads
    if page_size > 100:
        page_size = 100

    # Get total count (remove ordering to avoid issues with count)
    total_items = query.order_by(None).count()

    # Calculate total pages
    total_pages = (total_items + page_size - 1) // page_size

    # Adjust page if out of range
    if page > total_pages and total_pages > 0:
        page = total_pages

    # Calculate offset
    offset = (page - 1) * page_size

    # Get items for current page
    items = query.offset(offset).limit(page_size).all()

    # Determine if there are next/previous pages
    has_next = page < total_pages
    has_previous = page > 1

    return {
        "items": items,
        "page": page,
        "page_size": page_size,
        "total_items": total_items,
        "total_pages": total_pages,
        "has_next": has_next,
        "has_previous": has_previous,
    }
