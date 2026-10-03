// Institute contact details - shown in the footer and on the Contact page.
export const INSTITUTE = {
  name: 'Brilliant Institute',
  website: 'https://brilliantinstitute.edu.lk',
  email: 'brilliantinstitute.edu@gmail.com',
  phone: '0112 347 728',
  phoneHref: 'tel:+94112347728',
  address: '136, Sangamitha Mawatha, Colombo - 13',
  mapQuery: '136 Sangamitha Mawatha, Colombo 13, Sri Lanka',
};

// address of the map shown on the Contact page
export const MAP_EMBED_URL = `https://maps.google.com/maps?q=${encodeURIComponent(INSTITUTE.mapQuery)}&z=16&output=embed`;
// link that opens the same place in Google Maps
export const MAP_LINK_URL = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(INSTITUTE.mapQuery)}`;
