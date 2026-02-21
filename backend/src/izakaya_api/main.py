from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from izakaya_api.routers import auth, connectors, datasets, labels, mappings

app = FastAPI(title="Izakaya API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(connectors.router)
app.include_router(datasets.router)
app.include_router(mappings.router)
app.include_router(labels.router)


@app.get("/health")
def health():
    return {"status": "ok"}
