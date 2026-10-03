// avatar - a round profile picture, or the user's initials when there is no picture
import { getAssetUrl } from '../../api/assetUrl';
import Icon from './Icon';

// the first letters of the first two names
function initialsOf(fullName) {
  return (fullName || '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('');
}

// avatar - the picture, else the initials, else a user icon
function Avatar({ name, pictureUrl, size = 36, className = '', style }) {
  const dimensionStyle = { width: size, height: size, fontSize: Math.round(size * 0.4) };

  if (pictureUrl) {
    return (
      <img
        src={getAssetUrl(pictureUrl)}
        alt={name ? `${name}'s profile picture` : 'Profile picture'}
        className={`avatar-circle avatar-circle-img ${className}`.trim()}
        style={{ ...dimensionStyle, ...style }}
      />
    );
  }

  return (
    <span className={`avatar-circle ${className}`.trim()} style={{ ...dimensionStyle, ...style }}>
      {initialsOf(name) || <Icon name="user" size={Math.round(size * 0.45)} />}
    </span>
  );
}

export default Avatar;
