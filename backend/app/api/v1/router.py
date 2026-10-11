from fastapi import APIRouter

from app.api.v1.endpoints import admin, appointments, health, webhooks

api_router = APIRouter()
api_router.include_router(health.router, tags=["health"])
api_router.include_router(appointments.router)
api_router.include_router(admin.router)
api_router.include_router(webhooks.router)
