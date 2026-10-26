"""Postgres tables (SQLAlchemy 2). Schema changes go through Alembic migrations."""

from datetime import datetime
from typing import Any

from sqlalchemy import JSON, CheckConstraint, DateTime, ForeignKey, Integer, String, Text, create_engine, false, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker

from scouter.config import get_settings

Json = JSON().with_variant(JSONB(), "postgresql")


class Base(DeclarativeBase):
    type_annotation_map = {dict[str, Any]: Json, list[Any]: Json, datetime: DateTime(timezone=True)}


class JobRow(Base):
    __tablename__ = "jobs"
    __table_args__ = (CheckConstraint("status in ('pending', 'scored', 'parked')", name="jobs_status"),)

    id: Mapped[str] = mapped_column(String, primary_key=True)
    source: Mapped[str]
    source_id: Mapped[str]
    url: Mapped[str] = mapped_column(String, unique=True)
    title: Mapped[str]
    company: Mapped[str]
    location: Mapped[str | None]
    city: Mapped[str | None]
    work_mode: Mapped[str | None]
    posted_at: Mapped[datetime | None]
    found_at: Mapped[datetime]
    last_seen_at: Mapped[datetime]
    seniority: Mapped[str | None]
    language: Mapped[str] = mapped_column(String, default="en")
    text: Mapped[str] = mapped_column(Text)
    requirements: Mapped[list[Any]]
    content_hash: Mapped[str | None]
    status: Mapped[str] = mapped_column(String, default="pending", index=True)
    hidden_reason: Mapped[str | None]
    attempts: Mapped[int] = mapped_column(default=0, server_default="0")


class JobProfileRow(Base):
    __tablename__ = "job_profiles"

    content_hash: Mapped[str] = mapped_column(String, primary_key=True)
    model: Mapped[str]
    data: Mapped[dict[str, Any]]
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())


class ScoreRow(Base):
    __tablename__ = "scores"

    job_id: Mapped[str] = mapped_column(ForeignKey("jobs.id", ondelete="CASCADE"), primary_key=True)
    profile_version: Mapped[int] = mapped_column(Integer, primary_key=True)
    total: Mapped[int] = mapped_column(index=True)
    lines: Mapped[list[Any]]


class ProfileRow(Base):
    __tablename__ = "profiles"

    version: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    data: Mapped[dict[str, Any]]
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())


class AppSettingsRow(Base):
    """One row of switches that are not part of the scoring profile."""

    __tablename__ = "app_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    auto_scan: Mapped[bool] = mapped_column(default=False, server_default=false())


class ApplicationRow(Base):
    __tablename__ = "applications"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    job_id: Mapped[str] = mapped_column(ForeignKey("jobs.id"), unique=True)
    stage: Mapped[str]
    history: Mapped[list[Any]]
    notes: Mapped[str] = mapped_column(Text, default="")
    contact: Mapped[str | None]
    cv_version: Mapped[str | None]
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), onupdate=func.now())


class RunRow(Base):
    __tablename__ = "runs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    started_at: Mapped[datetime] = mapped_column(index=True)
    finished_at: Mapped[datetime | None]
    summary: Mapped[dict[str, Any]]
    error: Mapped[str | None] = mapped_column(Text)


class BoardRow(Base):
    __tablename__ = "boards"

    provider: Mapped[str] = mapped_column(String, primary_key=True)
    token: Mapped[str] = mapped_column(String, primary_key=True)
    company: Mapped[str]
    discovered_at: Mapped[datetime] = mapped_column(server_default=func.now())
    last_ok_at: Mapped[datetime | None]
    failures: Mapped[int] = mapped_column(default=0)


class EventRow(Base):
    """Domain events for later consumers (Realm, Chronicle pipeline). Spec §9."""

    __tablename__ = "events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    type: Mapped[str] = mapped_column(String, index=True)
    payload: Mapped[dict[str, Any]]
    at: Mapped[datetime] = mapped_column(server_default=func.now())


def make_engine(url: str | None = None) -> Engine:
    return create_engine(url or get_settings().database_url, pool_pre_ping=True)


def session_factory(url: str | None = None) -> sessionmaker:  # type: ignore[type-arg]
    return sessionmaker(make_engine(url), expire_on_commit=False)
