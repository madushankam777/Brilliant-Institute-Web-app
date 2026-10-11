// a feedback category as a coloured label - the same colour on every page
import { categoryTone } from '../../constants/feedbackCategories';

// category badge
function CategoryBadge({ category }) {
  return (
    <span className={`category-badge tone-${categoryTone(category)}`}>
      <span className="category-dot" aria-hidden="true" />
      {category}
    </span>
  );
}

export default CategoryBadge;
