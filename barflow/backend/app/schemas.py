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


class ProductUpsert(BaseModel):
    id: str = Field(min_length=1, max_length=128)
    name: str = Field(min_length=1, max_length=200)
    category: str = Field(min_length=1, max_length=100)
    price: int = Field(gt=0)
    stock: int = Field(ge=0)
    reorder: int = Field(ge=0)
    cost: int = Field(ge=0)
    unit: str = Field(min_length=1, max_length=40)
    tone: str = Field(default='slate', max_length=40)


class StockReceive(BaseModel):
    product_id: str = Field(min_length=1)
    quantity: int = Field(gt=0)
    reference: str = Field(default='Delivery', max_length=200)


class TeamMemberCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    role: Literal['Cashier', 'Manager', 'Storekeeper']
    pin: str = Field(pattern=r'^\d{4,6}$')


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


class DayCloseCreate(BaseModel):
    action: str = Field(pattern='^(open|close)$')
    opening_float: int | None = Field(default=0, ge=0)
    counted_cash: int | None = Field(default=None, ge=0)


class DayCloseOut(BaseModel):
    id: str
    business_date: str
    status: str
    opening_float: int
    counted_cash: int | None = None
    expected_cash: int | None = None
    cash_variance: int | None = None
    closed_at: str | None = None


class StockCountCreate(BaseModel):
    day_id: str = Field(min_length=1)
    product_id: str = Field(min_length=1)
    counted_quantity: int = Field(ge=0)


class StockCountOut(BaseModel):
    id: str
    day_id: str
    product_id: str
    counted_quantity: int
    expected_quantity: int
    variance_units: int
    variance_value: int


class VarianceToleranceCreate(BaseModel):
    product_id: str = Field(min_length=1)
    tolerance_units: int = Field(ge=0)


class VarianceToleranceOut(BaseModel):
    user_id: str
    product_id: str
    tolerance_units: int


class VarianceHistoryOut(BaseModel):
    id: str
    day_id: str
    product_id: str
    variance_units: int
    variance_value: int
    created_at: str


class DailyReportOut(BaseModel):
    business_date: str
    orders: int
    total_sales: int
    by_payment: list[dict]
    voids: int
    discounts: int
    wastage: int
    cash_variance: int
    stock_variance_value: int
    pour_cost: float


class LoginAttemptCreate(BaseModel):
    user_id: str = Field(min_length=1)
    success: bool
    ip_address: str | None = Field(default=None, max_length=100)


class LoginAttemptOut(BaseModel):
    id: str
    user_id: str
    attempted_at: str
    success: bool


class ExportRequest(BaseModel):
    tables: list[str] | None = Field(default=None, max_length=20)


class ExportTable(BaseModel):
    table: str
    rows: list[dict]
    count: int


class ExportResponse(BaseModel):
    exported_at: str
    tables: list[ExportTable]
