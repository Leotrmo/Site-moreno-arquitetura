// 15 categorias de gasto. A ORDEM importa para a categorização automática:
// palavras mais específicas devem vir antes (ex.: alimentação antes de transporte,
// para '99FOOD' casar antes de '99').
export const CATEGORIAS = [
  { id: 'alimentacao',  emoji: '🍽️', label: 'Alimentação',  desc: 'Restaurantes, delivery' },
  { id: 'mercado',      emoji: '🛒', label: 'Mercado',       desc: 'Supermercado, hortifruti' },
  { id: 'transporte',   emoji: '🚗', label: 'Transporte',    desc: 'Combustível, Uber, estac.' },
  { id: 'moradia',      emoji: '🏠', label: 'Moradia',       desc: 'Aluguel, condomínio, IPTU' },
  { id: 'utilities',    emoji: '💡', label: 'Utilities',     desc: 'Energia, internet, telefone' },
  { id: 'saude',        emoji: '💊', label: 'Saúde',         desc: 'Farmácia, consultas, plano' },
  { id: 'vestuario',    emoji: '👗', label: 'Vestuário',     desc: 'Roupas e calçados' },
  { id: 'lazer',        emoji: '🎮', label: 'Lazer',         desc: 'Cinema, streaming, eventos' },
  { id: 'viagem',       emoji: '✈️', label: 'Viagem',        desc: 'Hotel, passagens, turismo' },
  { id: 'educacao',     emoji: '📚', label: 'Educação',      desc: 'Cursos, livros, assinaturas' },
  { id: 'beleza',       emoji: '💅', label: 'Beleza',        desc: 'Salão, barbearia, cosméticos' },
  { id: 'pets',         emoji: '🐾', label: 'Pets',          desc: 'Pet shop, veterinário' },
  { id: 'financeiro',   emoji: '🏦', label: 'Financeiro',    desc: 'Tarifas, juros, IOF, seguros' },
  { id: 'parcelamento', emoji: '💳', label: 'Parcelamento',  desc: 'Compra parcelada identificada' },
  { id: 'outros',       emoji: '❓', label: 'Outros',        desc: 'Não classificado' },
];

// Palavras-chave para categorização automática (baseadas nos extratos reais).
// Comparação é case-insensitive por "contém".
export const AUTO_CATEGORIAS = {
  alimentacao: ['IFOOD', 'RAPPI', 'UBER EATS', '99FOOD', 'MCDONALDS', 'BURGER', 'PIZZA',
                'RESTAURANTE', 'LANCHONETE', 'PADARIA', 'CAFE', 'CAFETERIA', 'SUSHI',
                'GRILL', 'STEAKHOUSE', 'PASTEIS', 'APOLLO', 'CARNIVORE', 'LANCHERIA'],
  mercado:     ['SUPERMERCADO', 'CARREFOUR', 'EXTRA', 'PAO DE ACUCAR', 'ATACADAO', 'ASSAI',
                'MERCADO', 'HORTIFRUTI', 'SACOLAO', 'CONDOR', 'SUPERZAMP', 'GULLA MARKET'],
  transporte:  ['UBER', '99', 'POSTO', 'COMBUSTIVEL', 'GASOLINA', 'ESTACIONAMENTO',
                'SHELLBOX', 'IPIRANGA', 'SHELL'],
  utilities:   ['COPEL', 'SANEPAR', 'ENERGIA', 'INTERNET', 'CLARO', 'VIVO', 'TIM', 'OI',
                'NETFLIX', 'SPOTIFY', 'DISNEY', 'AMAZON PRIME', 'HBO', 'ADOBE', 'IFD*BR'],
  saude:       ['FARMACIA', 'DROGASIL', 'DROGA RAIA', 'RAIA DROGASIL', 'ULTRAFARMA',
                'HOSPITAL', 'CLINICA', 'MEDICO', 'DENTISTA', 'UNIMED', 'MEDPREV', 'NIS'],
  beleza:      ['BARBEARIA', 'SALAO', 'JACK JAMES', 'ESTETICA'],
  financeiro:  ['TARIFA', 'JUROS', 'IOF', 'ANUIDADE', 'MENSALIDADE PLANO', 'COTOLENGO'],
  vestuario:   ['CONVERSE', 'SHOPEE', 'NIKE', 'ADIDAS', 'ZARA', 'RENNER'],
};
