from setuptools import find_packages, setup

setup(
    name="izakaya-pipeline",
    version="0.1.0",
    packages=find_packages(where="src"),
    package_dir={"": "src"},
    install_requires=[
        "dagster>=1.9",
        "dagster-cloud",
        "dagster-webserver>=1.9",
        "sqlalchemy>=2.0",
        "psycopg2-binary>=2.9",
        "google-cloud-bigquery>=3.25",
        "pandas>=2.0",
        "httpx>=0.27",
        "db-dtypes>=1.0",
    ],
    python_requires=">=3.12",
)
