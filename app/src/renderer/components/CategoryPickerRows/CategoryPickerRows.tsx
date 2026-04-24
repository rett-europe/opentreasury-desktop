import { useTranslation } from 'react-i18next';
import type { CategoryRecord } from '../../types/config.js';
import '../TransactionFormFields/TransactionFormFields.css';

export interface CategoryPickerRowsProps {
  readonly categoryId: string;
  readonly onCategoryIdChange: (value: string) => void;
  readonly subcategoryId: string;
  readonly onSubcategoryIdChange: (value: string) => void;
  readonly categories?: readonly CategoryRecord[];
  readonly disabled?: boolean;
  /** Layout hint — `rows` renders Category + Subcategory on separate rows
   *  (used by the bulk-classify modal); `pair` renders them as a single two
   *  column row (matches the existing Add / Detail modals). Defaults to `pair`. */
  readonly layout?: 'pair' | 'rows';
  /** DOM-id prefix so multiple instances (Add modal + Detail modal + Bulk
   *  modal) can coexist without `htmlFor` collisions. Defaults to `tx`. */
  readonly idPrefix?: string;
}

/**
 * CategoryPickerRows — shared Category + Subcategory picker (WI-31b).
 *
 * Extracted from `TransactionFormFields` so the bulk-classify modal can
 * consume the exact same markup and styling as the Add / Detail modals.
 *
 * Subcategory options are filtered to the selected category's children
 * (previously the detail/add form listed every top-level category in the
 * subcategory dropdown — effectively unusable). Because subcategories are
 * always scoped to a category, this is the behaviour every call-site
 * expects. When no category is selected, the subcategory picker shows only
 * the `none` option and is disabled.
 */
export function CategoryPickerRows({
  categoryId,
  onCategoryIdChange,
  subcategoryId,
  onSubcategoryIdChange,
  categories = [],
  disabled = false,
  layout = 'pair',
  idPrefix = 'tx',
}: CategoryPickerRowsProps): JSX.Element {
  const { t } = useTranslation('common');

  const selectedCategory = categories.find((c) => c.id === categoryId);
  const subcategories = selectedCategory?.subcategories ?? [];
  const subcategoryDisabled = disabled || !categoryId;

  const categoryFieldId = `${idPrefix}-category`;
  const subcategoryFieldId = `${idPrefix}-subcategory`;

  const categoryField = (
    <div className="ot-tx-fields__field">
      <label htmlFor={categoryFieldId} className="ot-tx-fields__label">
        {t('transactionDetail.fields.category')}
      </label>
      <select
        id={categoryFieldId}
        value={categoryId}
        onChange={(e) => {
          const next = e.target.value;
          onCategoryIdChange(next);
          // Clear subcategory when the category changes so the selected
          // subcategory never belongs to a different parent.
          if (subcategoryId) {
            onSubcategoryIdChange('');
          }
        }}
        className="ot-tx-fields__input"
        disabled={disabled}
      >
        <option value="">{t('transactionDetail.fields.none')}</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    </div>
  );

  const subcategoryField = (
    <div className="ot-tx-fields__field">
      <label htmlFor={subcategoryFieldId} className="ot-tx-fields__label">
        {t('transactionDetail.fields.subcategory')}
      </label>
      <select
        id={subcategoryFieldId}
        value={subcategoryId}
        onChange={(e) => onSubcategoryIdChange(e.target.value)}
        className="ot-tx-fields__input"
        disabled={subcategoryDisabled}
      >
        <option value="">{t('transactionDetail.fields.none')}</option>
        {subcategories.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
    </div>
  );

  if (layout === 'rows') {
    return (
      <>
        <div className="ot-tx-fields__row">{categoryField}</div>
        <div className="ot-tx-fields__row">{subcategoryField}</div>
      </>
    );
  }

  return (
    <div className="ot-tx-fields__row">
      {categoryField}
      {subcategoryField}
    </div>
  );
}
