// category picker - one coloured chip per category (the same colours the admin and tutors see)
import { categoryTone } from '../../../../shared/client/src/constants/feedbackCategories';

// the chips
function CategoryPicker({ categories, value, onChange, error }) {
  return (
    <div className="form-field">
      <label id="category-label">Subject Category</label>
      <div className="category-picker" role="radiogroup" aria-labelledby="category-label">
        {categories.map((category) => (
          <button
            key={category}
            type="button"
            role="radio"
            aria-checked={value === category}
            className={`category-chip tone-${categoryTone(category)}${value === category ? ' is-checked' : ''}`}
            onClick={() => onChange(category)}
          >
            <span className="category-dot" aria-hidden="true" />
            {category}
          </button>
        ))}
      </div>
      {error && <p className="field-error">{error}</p>}
    </div>
  );
}

export default CategoryPicker;
