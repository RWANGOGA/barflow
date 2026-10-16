from enum import Enum
from typing import Literal
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
    note: str | None = Field(default=None, max_length=200)


class SalePaymentItem(BaseModel):
    method: PaymentMethod
    amount: int = Field(gt=0)


class SaleCreate(BaseModel):
    payment_method: PaymentMethod
    payment_items: list[SalePaymentItem] | None = Field(default=None, max_length=10)
    tendered_amount: int | None = Field(default=None, ge=0)
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

class TabVoid(BaseModel):
    reason: str = Field(min_length=3, max_length=500)
    pin: str | None = Field(default=None, max_length=20)

class TabReopen(BaseModel):
    reason: str = Field(min_length=3, max_length=500)

class InventoryCountCreate(BaseModel):
    product_id: str = Field(min_length=1)
    counted_quantity: int = Field(ge=0)
    notes: str | None = Field(default=None, max_length=500)

class StockAdjustmentCreate(BaseModel):
    product_id: str = Field(min_length=1)
    quantity: int
    adjustment_type: Literal['wastage', 'adjustment']
    reason: str = Field(min_length=3, max_length=500)

class Page(BaseModel):
    items: list[dict]
    next_cursor: str | None = None


class ReceiptCreate(BaseModel):
    sale_id: str = Field(min_length=1)
    is_copy: bool = False


class ReceiptOut(BaseModel):
    id: str
    user_id: str
    sale_id: str
    receipt_number: int
    is_copy: bool
    printed_at: str
    printed_by: str | None = None


class ReceiptReprintCreate(BaseModel):
    sale_id: str = Field(min_length=1)


class SettingCreate(BaseModel):
    key: str = Field(min_length=1, max_length=100)
    value: str = Field(min_length=1, max_length=1000)


class SettingOut(BaseModel):
    key: str
    value: str


class PinVerify(BaseModel):
    pin: str = Field(min_length=4, max_length=20)


class PinSet(BaseModel):
    pin: str = Field(min_length=4, max_length=20)


class DiscountCreate(BaseModel):
    sale_id: str = Field(min_length=1)
    amount: int = Field(gt=0)
    reason: str = Field(min_length=3, max_length=500)
    pin: str | None = Field(default=None, max_length=20)


class DiscountOut(BaseModel):
    id: str
    user_id: str
    sale_id: str | None = None
    amount: int
    reason: str
    approved_by: str | None = None
    approved_at: str | None = None
    created_at: str


class MenuStockLinkCreate(BaseModel):
    menu_item_id: str = Field(min_length=1)
    stock_item_id: str = Field(min_length=1)
    quantity_per_unit: int = Field(gt=0)


class MenuStockLinkOut(BaseModel):
    id: str
    user_id: str
    menu_item_id: str
    stock_item_id: str
    quantity_per_unit: int
    created_at: str


class DeliveryCreate(BaseModel):
    supplier: str = Field(min_length=1, max_length=200)
    product_id: str = Field(min_length=1)
    quantity: int = Field(gt=0)
    cost_price: int = Field(ge=0)
    delivery_date: str


class DeliveryOut(BaseModel):
    id: str
    user_id: str
    supplier: str
    product_id: str
    quantity: int
    cost_price: int
    delivery_date: str
    created_at: str


class TransferCreate(BaseModel):
    product_id: str = Field(min_length=1)
    quantity: int = Field(gt=0)
    from_location: str = Field(min_length=1, max_length=100)
    to_location: str = Field(min_length=1, max_length=100)
    reason: str | None = Field(default=None, max_length=500)


class TransferOut(BaseModel):
    id: str
    user_id: str
    product_id: str
    quantity: int
    from_location: str
    to_location: str
    reason: str | None = None
    created_at: str
