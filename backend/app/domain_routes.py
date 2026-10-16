from fastapi import APIRouter, Depends, HTTPException

from .auth import RequestActor, get_actor
from .authorization import Actor, require_permission
from .schemas import SaleCreate, TabCreate

router = APIRouter(prefix='/v1', tags=['domain'])


def not_ready(resource: str) -> None:
    raise HTTPException(status_code=501, detail=f'{resource} persistence is not wired yet.')


@router.post('/sales', status_code=202)
async def create_sale(payload: SaleCreate, actor: RequestActor = Depends(get_actor)):
    require_permission(Actor(actor.user_id, actor.role), 'sales.create')
    not_ready('Sales')


@router.post('/tabs', status_code=202)
async def create_tab(payload: TabCreate, actor: RequestActor = Depends(get_actor)):
    require_permission(Actor(actor.user_id, actor.role), 'tabs.manage')
    not_ready('Tabs')


@router.get('/inventory')
async def list_inventory(actor: RequestActor = Depends(get_actor)):
    require_permission(Actor(actor.user_id, actor.role), 'inventory.manage')
    not_ready('Inventory')


@router.post('/day-close', status_code=202)
async def close_day(actor: RequestActor = Depends(get_actor)):
    require_permission(Actor(actor.user_id, actor.role), 'day.close')
    not_ready('Day close')
