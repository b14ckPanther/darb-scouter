"""job attempts counter and parked status

Revision ID: b2attemptsparked
Revises: 14c5d5f5783b
"""

import sqlalchemy as sa
from alembic import op

revision = "b2attemptsparked"
down_revision = "14c5d5f5783b"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("jobs", sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"))
    op.drop_constraint("jobs_status", "jobs", type_="check")
    op.create_check_constraint("jobs_status", "jobs", "status in ('pending', 'scored', 'parked')")


def downgrade() -> None:
    op.drop_constraint("jobs_status", "jobs", type_="check")
    op.create_check_constraint("jobs_status", "jobs", "status in ('pending', 'scored')")
    op.drop_column("jobs", "attempts")
