from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from izakaya_api.config import settings
from izakaya_api.core.exceptions import DomainError
from izakaya_api.domains.analytics.router import router as analytics_router
from izakaya_api.domains.auth.router import router as auth_router
from izakaya_api.domains.connectors.router import router as connectors_router
from izakaya_api.domains.data_sources.router import router as data_sources_router
from izakaya_api.domains.labels.router import router as labels_router
from izakaya_api.domains.releases.router import router as releases_router
from izakaya_api.routers import datasets as dataset_types

app = FastAPI(title="DataOS API", redirect_slashes=False)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(DomainError)
async def domain_error_handler(_request: Request, exc: DomainError) -> JSONResponse:
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.message})


app.include_router(auth_router)
app.include_router(connectors_router)
app.include_router(analytics_router)
app.include_router(dataset_types.router)
app.include_router(data_sources_router)
app.include_router(labels_router)
app.include_router(releases_router)


@app.get("/health")
def health():
    return {"status": "ok"}
