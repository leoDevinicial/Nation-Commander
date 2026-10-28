/**
 * Cidades reais de cada país (fora a capital, que é a sede do QG), na ordem em que as prefeituras
 * do jogador recebem os nomes: das maiores para as menores, em grafia portuguesa quando há uma
 * consagrada. Esgotada a lista, os nomes seguem como "Nova <cidade>".
 */
export const CITY_NAMES: Record<string, readonly string[]> = {
  BRA: ['São Paulo', 'Rio de Janeiro', 'Salvador', 'Fortaleza', 'Belo Horizonte', 'Manaus', 'Curitiba', 'Recife', 'Goiânia', 'Belém', 'Porto Alegre', 'Campinas', 'São Luís', 'Maceió', 'Natal', 'Florianópolis'],
  ARG: ['Córdoba', 'Rosário', 'Mendoza', 'La Plata', 'San Miguel de Tucumán', 'Mar del Plata', 'Salta', 'Santa Fé', 'San Juan', 'Resistencia', 'Neuquén', 'Bahía Blanca', 'Corrientes', 'Posadas', 'Ushuaia', 'Paraná'],
  USA: ['Nova York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix', 'Filadélfia', 'San Antonio', 'San Diego', 'Dallas', 'Seattle', 'Denver', 'Boston', 'Miami', 'Atlanta', 'Detroit', 'São Francisco'],
  MEX: ['Guadalajara', 'Monterrey', 'Puebla', 'Tijuana', 'León', 'Juárez', 'Zapopan', 'Mérida', 'San Luis Potosí', 'Aguascalientes', 'Querétaro', 'Chihuahua', 'Cancún', 'Acapulco', 'Veracruz', 'Hermosillo'],
  DEU: ['Hamburgo', 'Munique', 'Colônia', 'Frankfurt', 'Stuttgart', 'Düsseldorf', 'Leipzig', 'Dortmund', 'Essen', 'Bremen', 'Dresden', 'Hanôver', 'Nuremberg', 'Duisburg', 'Bonn', 'Kiel'],
  FRA: ['Marselha', 'Lyon', 'Toulouse', 'Nice', 'Nantes', 'Estrasburgo', 'Montpellier', 'Bordeaux', 'Lille', 'Rennes', 'Reims', 'Toulon', 'Grenoble', 'Dijon', 'Le Havre', 'Brest'],
  IND: ['Mumbai', 'Bangalore', 'Hyderabad', 'Ahmedabad', 'Chennai', 'Calcutá', 'Pune', 'Jaipur', 'Surat', 'Lucknow', 'Kanpur', 'Nagpur', 'Indore', 'Bhopal', 'Patna', 'Agra'],
  JPN: ['Yokohama', 'Osaka', 'Nagoya', 'Sapporo', 'Fukuoka', 'Kobe', 'Kawasaki', 'Kyoto', 'Saitama', 'Hiroshima', 'Sendai', 'Chiba', 'Kitakyushu', 'Niigata', 'Hamamatsu', 'Nagasaki'],
  ZAF: ['Joanesburgo', 'Cidade do Cabo', 'Durban', 'Porto Elizabeth', 'Bloemfontein', 'East London', 'Pietermaritzburg', 'Polokwane', 'Kimberley', 'Rustenburg', 'Nelspruit', 'George', 'Soweto', 'Vereeniging', 'Welkom', 'Upington'],
  AUS: ['Sydney', 'Melbourne', 'Brisbane', 'Perth', 'Adelaide', 'Gold Coast', 'Newcastle', 'Wollongong', 'Hobart', 'Geelong', 'Townsville', 'Cairns', 'Darwin', 'Toowoomba', 'Ballarat', 'Bendigo'],
  GBR: ['Birmingham', 'Manchester', 'Glasgow', 'Liverpool', 'Leeds', 'Edimburgo', 'Bristol', 'Sheffield', 'Cardiff', 'Belfast', 'Newcastle', 'Nottingham', 'Leicester', 'Southampton', 'Aberdeen', 'Oxford'],
  CHN: ['Xangai', 'Cantão', 'Shenzhen', 'Chongqing', 'Tianjin', 'Chengdu', 'Wuhan', 'Nanquim', "Xi'an", 'Hangzhou', 'Shenyang', 'Harbin', 'Qingdao', 'Dalian', 'Kunming', 'Xiamen'],
  ITA: ['Milão', 'Nápoles', 'Turim', 'Palermo', 'Gênova', 'Bolonha', 'Florença', 'Bari', 'Catânia', 'Veneza', 'Verona', 'Messina', 'Pádua', 'Trieste', 'Parma', 'Cagliari'],
  CAN: ['Toronto', 'Montreal', 'Vancouver', 'Calgary', 'Edmonton', 'Winnipeg', 'Quebec', 'Hamilton', 'Halifax', 'Victoria', 'Saskatoon', 'Regina', 'Windsor', 'Kitchener', "St. John's", 'London'],
  SAU: ['Jidá', 'Meca', 'Medina', 'Dammam', 'Taif', 'Tabuk', 'Buraidah', 'Khobar', 'Abha', 'Hail', 'Najran', 'Jizan', 'Yanbu', 'Al-Hofuf', 'Jubail', 'Khamis Mushait'],
  ESP: ['Barcelona', 'Valência', 'Sevilha', 'Saragoça', 'Málaga', 'Múrcia', 'Palma', 'Bilbau', 'Alicante', 'Córdoba', 'Valladolid', 'Vigo', 'Granada', 'Corunha', 'Salamanca', 'Toledo'],
  EGY: ['Alexandria', 'Gizé', 'Porto Said', 'Suez', 'Luxor', 'Mansura', 'Tanta', 'Assiut', 'Ismaília', 'Faium', 'Zagazig', 'Assuã', 'Damieta', 'Minia', 'Hurghada', 'Sharm el-Sheikh'],
  RUS: ['São Petersburgo', 'Novosibirsk', 'Ecaterimburgo', 'Kazan', 'Níjni Novgorod', 'Cheliabinsk', 'Samara', 'Omsk', 'Rostov do Don', 'Ufa', 'Krasnoyarsk', 'Voronej', 'Volgogrado', 'Vladivostok', 'Irkutsk', 'Murmansk'],
  TUR: ['Istambul', 'Esmirna', 'Bursa', 'Antália', 'Adana', 'Konya', 'Gaziantep', 'Diyarbakır', 'Kayseri', 'Mersin', 'Eskişehir', 'Samsun', 'Trabzon', 'Erzurum', 'Malatya', 'Van'],
  KOR: ['Busan', 'Incheon', 'Daegu', 'Daejeon', 'Gwangju', 'Suwon', 'Ulsan', 'Changwon', 'Goyang', 'Seongnam', 'Cheongju', 'Jeonju', 'Pohang', 'Jeju', 'Gangneung', 'Chuncheon'],
  PRK: ['Hamhung', 'Chongjin', 'Nampo', 'Wonsan', 'Sinuiju', 'Tanchon', 'Kaechon', 'Kaesong', 'Sariwon', 'Hyesan', 'Kanggye', 'Haeju', 'Anju', 'Rason', 'Kimchaek', 'Songnim'],
};

/**
 * Próximo nome de cidade de um país, pulando os já usados na partida. Sem lista (país
 * desconhecido) os nomes são numerados.
 */
export function nextCityName(countryId: string | undefined, used: ReadonlySet<string>): string {
  const list = (countryId && CITY_NAMES[countryId]) || [];
  for (const n of list) if (!used.has(n)) return n;
  for (const n of list) if (!used.has(`Nova ${n}`)) return `Nova ${n}`;
  for (let i = 1; ; i++) if (!used.has(`Cidade ${i}`)) return `Cidade ${i}`;
}
