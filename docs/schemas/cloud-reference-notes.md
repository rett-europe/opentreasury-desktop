# Cloud Reference Model (rett-europe/opentreasury)

Source: `api/app/models/schemas.py` and `api/app/models/domain.py` from https://github.com/rett-europe/opentreasury

## Core Entities

### Transaction (Movement)
Cloud document shape:
- `id`: string (UUID in cloud; we'll use ULID per crypto-spec §11)
- `transaction_date`: date (aliased as `date` in API) — **required**
- `value_date`: date | null
- `year`: int (computed)
- `month`: int (computed, 1-12)
- `partition_key`: string (YYYY-MM format for Cosmos partitioning)
- `amount`: Decimal (12 digits, 2 decimal places) — **required**
- `currency`: string (default "EUR")
- `balance`: Decimal | null (14 digits, 2 decimals) — account balance after this tx
- `movement_number`: string | null (max 50 chars) — bank statement reference
- `branch_number`: string | null (max 50 chars)
- `bank_description`: string | null (max 500 chars)
- `account_id`: string — **required** (FK to Account)
- `transaction_type`: enum (`income` | `expense` | `transfer` | `refund`) — **required**
- `category_id`: string | null (FK to Category)
- `subcategory_id`: string | null (FK to Subcategory)
- `categorization_status`: enum (`uncategorized` | `manually_categorized` | `auto_categorized`) — computed
- `tag_ids`: string[] (FKs to Tags, empty array default)
- `detail`: string | null (max 2000 chars) — user notes
- `source_reference`: string | null (max 100 chars) — import source ID
- `counterparty_name`: string | null (max 200 chars)
- `counterparty_reference`: string | null (max 200 chars)
- `review_status`: enum (`pending` | `reviewed` | `approved` | `flagged`) — default "pending"
- `reviewed_by`: string | null (user ID)
- `reviewed_by_name`: string | null
- `reviewed_at`: datetime | null
- `original_amount`: Decimal | null — for edited transactions
- `original_date`: string | null — for edited transactions
- `notes`: Note[] (array of note objects)
- `created_by`: string (user ID) — **required**
- `created_by_name`: string | null
- `created_at`: datetime — **required**
- `updated_by`: string | null
- `updated_by_name`: string | null
- `updated_at`: datetime | null
- `is_deleted`: bool (default false) — soft delete
- `is_split`: bool (default false)
- `split_count`: int (default 0)
- `split_lines`: SplitLine[] (array, empty default)
- `split_category_ids`: string[] (denormalized for queries, empty default)

**Split Lines:**
- `id`: string
- `amount`: Decimal (12 digits, 2 decimals)
- `category_id`: string | null
- `subcategory_id`: string | null
- `tag_ids`: string[] (empty array default)
- `detail`: string | null (max 2000 chars)
- `sort_order`: int (default 0)

**Notes:**
- `id`: string
- `text`: string (max 1000 chars)
- `author`: string (user ID)
- `author_name`: string | null
- `created_at`: datetime

### Account
Cloud document shape:
- `id`: string (UUID in cloud; ULID in desktop)
- `bank_name`: string (max 100 chars) — **required**
- `bank_name_short`: string | null (max 50 chars)
- `iban`: string | null (max 34 chars)
- `paypal_email`: string | null (max 200 chars)
- `account_label`: string (max 200 chars) — **required** (display name)
- `is_paypal`: bool (default false)
- `currency`: string (default "EUR", max 3 chars)
- `color`: string | null (max 7 chars) — validated against palette in `app/constants/account_colors.py`
- `sort_order`: int (default 0)
- `is_active`: bool (default true) — soft delete
- `created_at`: datetime — **required**
- `updated_at`: datetime | null

### Category
Cloud document shape:
- `id`: string (UUID in cloud; ULID in desktop)
- `name`: string (max 100 chars) — **required**
- `description`: string | null (max 300 chars)
- `category_type`: enum (`income` | `expense`) — **required**
- `sort_order`: int (default 0)
- `is_active`: bool (default true) — soft delete
- `subcategories`: Subcategory[] (embedded array)
- `created_at`: datetime — **required**
- `updated_at`: datetime | null

**Subcategory (embedded):**
- `id`: string
- `name`: string (max 100 chars)
- `is_active`: bool (default true)

### Tag
Cloud document shape:
- `id`: string (UUID in cloud; ULID in desktop)
- `name`: string (max 100 chars) — **required**
- `color`: string | null (max 20 chars)
- `sort_order`: int (default 0)
- `is_active`: bool (default true)
- `created_at`: datetime — **required**
- `updated_at`: datetime | null

## Enums

From `domain.py`:

```python
class TransactionType(str, Enum):
    INCOME = "income"
    EXPENSE = "expense"
    TRANSFER = "transfer"
    REFUND = "refund"

class CategoryType(str, Enum):
    INCOME = "income"
    EXPENSE = "expense"

class CategorizationStatus(str, Enum):
    UNCATEGORIZED = "uncategorized"
    MANUALLY_CATEGORIZED = "manually_categorized"
    AUTO_CATEGORIZED = "auto_categorized"

class ReviewStatus(str, Enum):
    PENDING = "pending"
    REVIEWED = "reviewed"
    APPROVED = "approved"
    FLAGGED = "flagged"

class AuditAction(str, Enum):
    CREATE = "Create"
    UPDATE = "Update"
    DELETE = "Delete"
    SPLIT = "Split"
```

## Desktop Adaptation Notes

1. **IDs:** Cloud uses UUIDs; desktop will use ULIDs per crypto-spec §11.
2. **Timestamps:** Cloud uses Python `datetime`; desktop will use ISO-8601 strings in events, parsed to Date objects in TypeScript.
3. **Decimal precision:** Cloud uses Python `Decimal` with explicit rounding. Desktop will use `number` with explicit rounding to 2 decimals where needed.
4. **Soft deletes:** Cloud uses `is_deleted` / `is_active`. Desktop mirrors this pattern.
5. **Audit fields:** Cloud stores `created_by`, `updated_by` as Entra ID user IDs. Desktop is single-user, so these fields will be constants (e.g., "local-user") or omitted in M1.
6. **Partitioning:** Cloud partitions transactions by `partition_key` (YYYY-MM). Desktop uses append-only event log with no partitioning in M1.
7. **Review status:** Cloud uses `pending` | `reviewed` | `approved` | `flagged`. Desktop M1 will simplify to `pending` | `approved` to match Trinity's Movement.status type.
8. **Split transactions:** Cloud supports multi-line splits. Desktop M1 defers splits to later milestone.
9. **Notes:** Cloud supports per-transaction notes. Desktop M1 defers to later milestone.

## Field Mapping: Cloud → Desktop Event Payload

| Cloud Field             | Desktop Event Payload Field | Notes                                  |
|-------------------------|----------------------------|----------------------------------------|
| `id`                    | `id`                       | ULID (not UUID)                        |
| `transaction_date`      | `date`                     | ISO-8601 YYYY-MM-DD                    |
| `value_date`            | (omit M1)                  | Optional feature                       |
| `amount`                | `amount`                   | Number (2 decimal places)              |
| `currency`              | `currency`                 | Always "EUR" in M1                     |
| `bank_description`      | `description`              | Max 500 chars                          |
| `account_id`            | `accountId`                | ULID reference                         |
| `transaction_type`      | `type`                     | Simplified to `income` \| `expense` in M1 |
| `category_id`           | `categoryId`               | ULID reference, nullable               |
| `subcategory_id`        | `subcategoryId`            | ULID reference, nullable               |
| `tag_ids`               | `tagIds`                   | Array of ULIDs                         |
| `detail`                | (omit M1)                  | User notes deferred                    |
| `review_status`         | `status`                   | `pending` \| `approved` only in M1    |
| `created_at`            | `createdAt`                | ISO-8601 timestamp                     |

Account, Category, Subcategory, Tag entities follow similar patterns with camelCase field names and ULID ids.
