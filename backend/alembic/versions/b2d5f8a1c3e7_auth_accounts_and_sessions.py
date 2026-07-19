"""auth accounts and sessions

Revision ID: b2d5f8a1c3e7
Revises: 887f937d13f5
Create Date: 2026-07-19 03:10:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b2d5f8a1c3e7'
down_revision: Union[str, None] = '887f937d13f5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('auth_accounts',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('email', sa.String(length=255), nullable=False),
        sa.Column('role', sa.String(length=32), nullable=False),
        sa.Column('display_name', sa.String(length=255), nullable=False),
        sa.Column('password_salt', sa.String(length=64), nullable=False),
        sa.Column('password_hash', sa.String(length=128), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('email', 'role', name='uq_auth_email_role'),
    )
    with op.batch_alter_table('auth_accounts', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_auth_accounts_email'), ['email'], unique=False)
        batch_op.create_index(batch_op.f('ix_auth_accounts_role'), ['role'], unique=False)

    op.create_table('auth_sessions',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('account_id', sa.Integer(), nullable=False),
        sa.Column('token_hash', sa.String(length=64), nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['account_id'], ['auth_accounts.id'], ),
        sa.PrimaryKeyConstraint('id'),
    )
    with op.batch_alter_table('auth_sessions', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_auth_sessions_account_id'), ['account_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_auth_sessions_token_hash'), ['token_hash'], unique=True)


def downgrade() -> None:
    with op.batch_alter_table('auth_sessions', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_auth_sessions_token_hash'))
        batch_op.drop_index(batch_op.f('ix_auth_sessions_account_id'))
    op.drop_table('auth_sessions')

    with op.batch_alter_table('auth_accounts', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_auth_accounts_role'))
        batch_op.drop_index(batch_op.f('ix_auth_accounts_email'))
    op.drop_table('auth_accounts')
