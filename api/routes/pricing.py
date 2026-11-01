from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from api.database import get_db
from api.models import PriceRule
from api.schemas import PriceRuleCreate, PriceRuleOut, PriceRuleUpdate
from api.user_messages import msg

router = APIRouter(prefix="/pricing", tags=["pricing"])

DEFAULT_RULES = [
    {"duration_from_min": 0, "duration_to_min": 30, "price": "0.00", "label": "First 30 min (free)"},
    {"duration_from_min": 30, "duration_to_min": 60, "price": "20.00", "label": "30–60 min"},
    {"duration_from_min": 60, "duration_to_min": 120, "price": "35.00", "label": "1–2 hours"},
    {"duration_from_min": 120, "duration_to_min": None, "price": "50.00", "label": "Over 2 hours"},
]


def seed_default_rules(db: Session) -> None:
    if db.query(PriceRule).count() == 0:
        for r in DEFAULT_RULES:
            db.add(PriceRule(**r))
        db.commit()


@router.get("", response_model=list[PriceRuleOut], summary="List all pricing rules")
def list_rules(db: Session = Depends(get_db)) -> list[PriceRuleOut]:
    rules = db.query(PriceRule).order_by(PriceRule.duration_from_min).all()
    return [PriceRuleOut.model_validate(r) for r in rules]


@router.post("", response_model=PriceRuleOut, status_code=201, summary="Add a pricing rule")
def create_rule(body: PriceRuleCreate, db: Session = Depends(get_db)) -> PriceRuleOut:
    rule = PriceRule(**body.model_dump())
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return PriceRuleOut.model_validate(rule)


@router.put("/{rule_id}", response_model=PriceRuleOut, summary="Update a pricing rule")
def update_rule(
    rule_id: int,
    body: PriceRuleUpdate,
    db: Session = Depends(get_db),
) -> PriceRuleOut:
    rule = db.query(PriceRule).filter(PriceRule.id == rule_id).first()
    if not rule:
        raise HTTPException(status_code=404, detail=msg("price_rule_not_found"))
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(rule, field, value)
    db.commit()
    db.refresh(rule)
    return PriceRuleOut.model_validate(rule)


@router.delete("/{rule_id}", status_code=204, summary="Delete a pricing rule")
def delete_rule(rule_id: int, db: Session = Depends(get_db)) -> None:
    rule = db.query(PriceRule).filter(PriceRule.id == rule_id).first()
    if not rule:
        raise HTTPException(status_code=404, detail=msg("price_rule_not_found"))
    db.delete(rule)
    db.commit()
