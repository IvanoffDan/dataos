"""update admin password

Revision ID: 25c86c44d4f0
Revises: dbf47393a748
Create Date: 2026-02-21 19:09:08.441110

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '25c86c44d4f0'
down_revision: Union[str, None] = 'dbf47393a748'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        "UPDATE users SET password_hash = '$2b$12$HmNsYSr6X5QlymhApoxqS.ZuOam1r10JG8Kki06m3Mth/wQcMr0we' "
        "WHERE username = 'admin'"
    )


def downgrade() -> None:
    op.execute(
        "UPDATE users SET password_hash = '$2b$12$ltMX.QM1/QAOcqywZxj8g..dLuTAOfUOpQy0lNhatI.CNRDgOlGHC' "
        "WHERE username = 'admin'"
    )
