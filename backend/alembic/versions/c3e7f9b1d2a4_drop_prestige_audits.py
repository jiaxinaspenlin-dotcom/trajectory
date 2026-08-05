"""drop prestige_audits table (prestige-free ranking removed)

Revision ID: c3e7f9b1d2a4
Revises: b2d5f8a1c3e7
Create Date: 2026-07-19 05:20:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c3e7f9b1d2a4'
down_revision: Union[str, None] = 'b2d5f8a1c3e7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_table('prestige_audits')


def downgrade() -> None:
    op.create_table('prestige_audits',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('fund_id', sa.Integer(), nullable=False),
        sa.Column('computed_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('entries', sa.JSON(), nullable=False),
        sa.Column('is_demo', sa.Boolean(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['fund_id'], ['funds.id'], ),
        sa.PrimaryKeyConstraint('id'),
    )
    with op.batch_alter_table('prestige_audits', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_prestige_audits_fund_id'), ['fund_id'], unique=False)
