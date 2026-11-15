"""web sourcing: searches, lead identifiers, evidence review state

Revision ID: d4a9e2c7f1b3
Revises: c3e7f9b1d2a4
Create Date: 2026-11-13 10:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd4a9e2c7f1b3'
down_revision: Union[str, None] = 'c3e7f9b1d2a4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _timestamps() -> list[sa.Column]:
    return [
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    ]


def upgrade() -> None:
    op.create_table('web_searches',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('fund_id', sa.Integer(), nullable=False),
        sa.Column('request', sa.Text(), nullable=False),
        sa.Column('provider', sa.String(length=32), nullable=False),
        sa.Column('queries', sa.JSON(), nullable=False),
        sa.Column('status', sa.String(length=32), nullable=False),
        sa.Column('source_count', sa.Integer(), nullable=False),
        sa.Column('sources', sa.JSON(), nullable=False),
        sa.Column('results', sa.JSON(), nullable=False),
        sa.Column('rejected', sa.JSON(), nullable=False),
        sa.Column('notes', sa.JSON(), nullable=False),
        *_timestamps(),
        sa.ForeignKeyConstraint(['fund_id'], ['funds.id'], ),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_web_searches_fund_id'), 'web_searches', ['fund_id'], unique=False)

    op.create_table('lead_identifiers',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('opportunity_id', sa.Integer(), nullable=False),
        sa.Column('kind', sa.String(length=16), nullable=False),
        sa.Column('value', sa.String(length=512), nullable=False),
        sa.Column('verified', sa.Boolean(), nullable=False),
        sa.Column('source_url', sa.String(length=1024), nullable=True),
        *_timestamps(),
        sa.ForeignKeyConstraint(['opportunity_id'], ['opportunities.id'], ),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_lead_identifiers_opportunity_id'), 'lead_identifiers', ['opportunity_id'], unique=False)
    op.create_index(op.f('ix_lead_identifiers_value'), 'lead_identifiers', ['value'], unique=False)

    op.create_table('lead_evidence_reviews',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('opportunity_id', sa.Integer(), nullable=False),
        sa.Column('reviewed_at', sa.DateTime(timezone=True), nullable=False),
        *_timestamps(),
        sa.ForeignKeyConstraint(['opportunity_id'], ['opportunities.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('opportunity_id'),
    )


def downgrade() -> None:
    op.drop_table('lead_evidence_reviews')
    op.drop_index(op.f('ix_lead_identifiers_value'), table_name='lead_identifiers')
    op.drop_index(op.f('ix_lead_identifiers_opportunity_id'), table_name='lead_identifiers')
    op.drop_table('lead_identifiers')
    op.drop_index(op.f('ix_web_searches_fund_id'), table_name='web_searches')
    op.drop_table('web_searches')
