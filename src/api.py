"""
Central API router for the Cortex application.
"""

from fastapi import APIRouter

from .observability.interface.rest.routes import router as observability_router

api_router = APIRouter()
api_router.include_router(observability_router)
