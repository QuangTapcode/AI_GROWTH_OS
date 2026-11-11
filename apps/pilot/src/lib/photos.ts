export type SitePhoto={src:string;title:string;author:string;source:string;license?:string;licenseName?:string};
/** Each photograph retains the license listed on its original source page. */
export const photos={
  coast:{src:'/images/my-khe-coast.webp',title:'My Khe Beach Danang Coastline',author:'Jpatokal',source:'https://commons.wikimedia.org/wiki/File:My_Khe_Beach_Danang_Coastline.jpg'},
  beach:{src:'/images/my-khe-beach.webp',title:'My Khe Beach 5',author:'Christophe95',source:'https://commons.wikimedia.org/wiki/File:My_Khe_Beach_5.jpg'},
  bridgeRiver:{src:'/images/dragon-bridge-river.webp',title:'Dragon Bridge Da Nang 5',author:'Christophe95',source:'https://commons.wikimedia.org/wiki/File:Dragon_Bridge_Da_Nang_5.jpg'},
  bridgeCity:{src:'/images/dragon-bridge-city.webp',title:'Dragon Bridge Da Nang 2',author:'Christophe95',source:'https://commons.wikimedia.org/wiki/File:Dragon_Bridge_Da_Nang_2.jpg'},
  city:{src:'/images/danang-city-view.webp',title:'View of Da Nang',author:'Christophe95',source:'https://commons.wikimedia.org/wiki/File:View_of_Da_Nang.jpg'},
  apartment:{src:'/images/apartment-living-room.webp',title:'Modern Apartment Interior Design (topic illustration, not a verified Da Nang listing)',author:'Vidal Balielo Jr.',source:'https://www.pexels.com/photo/modern-apartment-interior-design-11296222/',license:'https://www.pexels.com/license/',licenseName:'Pexels License'},
  market:{src:'/images/danang-con-market.webp',title:'Con Market 1',author:'Christophe95',source:'https://commons.wikimedia.org/wiki/File:Con_Market_1.jpg'},
  cafe:{src:'/images/danang-cafe-interior.webp',title:'Modern Interior Design in Da Nang Cafe',author:'QUI NGUYEN',source:'https://www.pexels.com/photo/modern-interior-design-in-da-nang-cafe-32303447/',license:'https://www.pexels.com/license/',licenseName:'Pexels License'},
  coffee:{src:'/images/danang-coffee-table.webp',title:'Refreshing Coffee and Plant in Da Nang Café',author:'nhavantuonglai',source:'https://www.pexels.com/photo/refreshing-coffee-and-plant-in-da-nang-cafe-32744964/',license:'https://www.pexels.com/license/',licenseName:'Pexels License'},
} as const;
export const PHOTO_LICENSE='https://creativecommons.org/licenses/by-sa/4.0/';
