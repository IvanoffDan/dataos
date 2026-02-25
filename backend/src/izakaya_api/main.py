from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from izakaya_api.config import settings
from izakaya_api.routers import auth, connectors, dashboard, data_sources, datasets as dataset_types, explore, labels, pipeline, releases

app = FastAPI(title="DataOS API", redirect_slashes=False)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(connectors.router)
app.include_router(dashboard.router)
app.include_router(dataset_types.router)
app.include_router(data_sources.router)
app.include_router(explore.router)
app.include_router(labels.router)
app.include_router(pipeline.router)
app.include_router(releases.router)


@app.get("/health")
def health():
    return {"status": "ok"}
