export const REGIONS=[
 {id:'floor',name:'Crater floor',icon:'◯',description:'Explore the landing area and photographed outcrops.',accept:p=>p.id<=16},
 {id:'delta',name:'Delta edge',icon:'≋',description:'Explore the ridge and delta-side viewpoints, including Enchanted Lake.',accept:p=>p.id>=17&&p.id<=24},
 {id:'upper',name:'Upper traverse',icon:'△',description:'Visit later rover viewpoints around Snowdrift Peak and Lookout Mountain.',accept:p=>p.id>=25}
];
export function regionStops(panos,id){const region=REGIONS.find(r=>r.id===id);return region?panos.filter(region.accept):[]}
export function poiDescription(p){if(/Martre/.test(p.name))return 'Photographed outcrop. Compare rock textures and surface layers.';if(/Enchanted Lake/.test(p.name))return 'A rover viewpoint near the delta. Inspect the surrounding terrain.';if(/Landing/.test(p.name))return 'Early rover views from the landing area.';if(/Ridge|Peak|Mountain|Scarp/.test(p.name))return 'A landscape viewpoint for comparing relief and exposed rock.';return 'Explore this recorded rover panorama and inspect nearby rock textures.'}
