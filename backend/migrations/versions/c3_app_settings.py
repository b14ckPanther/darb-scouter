"""app settings: the daily scan switch

Revision ID: c3appsettings
Revises: b2attemptsparked
"""

import sqlalchemy as sa
from alembic import op

revision = "c3appsettings"
down_revision = "b2attemptsparked"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "app_settings",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("auto_scan", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_table("app_settings")
