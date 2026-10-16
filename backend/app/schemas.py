from enum import Enum
from pydantic import BaseModel, Field

class Role(str, Enum):
    admin = 'Admin'
    manager = 'Manager'
    cashier = 'Cashier'
    storekeeper = 'Storekeeper'

class PaymentMethod(str, Enum):
    cash = 'cash'
    mobile_money = 'mobile_money'
    card = 'card'

class SaleItem(BaseModel):
    product_id: str = Field(min_length=1)
    quantity: int = Field(gt=0)

class SaleCreate(BaseModel):
    payment_method: PaymentMethod
    items: list[SaleItem] = Field(min_length=1)
    table_label: str | None = Field(default=None, max_length=80)
    idempotency_key: str = Field(min_length=8, max_length=128)

class TabCreate(BaseModel):
    table_label: str = Field(min_length=1, max_length=80)
    owner_name: str = Field(min_length=1, max_length=120)

class TabItemCreate(BaseModel):
    product_id: str = Field(min_length=1)
    quantity: int = Field(gt=0)

class TabItemUpdate(BaseModel):
    quantity: int = Field(gt=0)

class TabSettle(BaseModel):
    payment_method: PaymentMethod
    idempotency_key: str = Field(min_length=8, max_length=128)

class Page(BaseModel):
    items: list[dict]
    next_cursor: str | None = None
