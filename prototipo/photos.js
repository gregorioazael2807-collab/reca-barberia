// Curated against the downloaded contact sheet. Sources: assets/photo-sources.json.
// Names describe inspiration, not a guarantee of an identical result.
const entries = [
  [1, 'fade', 'Degradado preciso', 'Precision fade', 'Laterales cortos y volumen superior.', 'Short sides with volume on top.', 'Ahmad Ebadi'],
  [2, 'fade', 'Degradado con diseño', 'Fade with design', 'Degradado con detalle de corazón.', 'Fade with a heart-shaped detail.', 'Mohamed B.'],
  [3, 'fade', 'Contornos definidos', 'Defined edges', 'Referencia de acabado y líneas limpias.', 'Inspiration for a clean, defined finish.', 'John Rodriguez'],
  [4, 'fade', 'Pompadour con líneas', 'Pompadour with lines', 'Volumen elevado y líneas laterales.', 'Lifted volume and side designs.', 'Amritpal Singh'],
  [5, 'textured', 'Rizos naturales', 'Natural curls', 'Textura rizada con laterales contenidos.', 'Curly texture with controlled sides.', 'Affan Khan'],
  [6, 'classic', 'Peinado a tijera', 'Scissor styling', 'Trabajo con peine para un acabado clásico.', 'Comb work for a classic finish.', 'Josh Marty'],
  [7, 'classic', 'Precisión a tijera', 'Scissor precision', 'Referencia del trabajo artesanal del corte.', 'Inspiration for handcrafted haircut detail.', 'Peter Vimalis'],
  [8, 'textured', 'Volumen informal', 'Casual volume', 'Peinado superior con movimiento natural.', 'Top styling with natural movement.', 'Stephan Louis'],
  [9, 'classic', 'Clásico lateral', 'Side-swept classic', 'Perfil pulido y peinado hacia un lado.', 'A polished profile and side-swept styling.', 'Megan Bagshaw'],
  [10, 'fade', 'Quiff estructurado', 'Structured quiff', 'Frontal elevado y laterales cortos.', 'Lifted front and short sides.', 'Hannah Skelly'],
  [11, 'classic', 'Acabado con volumen', 'Volume finish', 'Referencia de secado y acabado profesional.', 'Inspiration for professional drying and finishing.', 'delfina pan'],
  [12, 'fade', 'Degradado a tijera', 'Scissor fade', 'Transición lateral y ajuste de longitud.', 'Side transition and length adjustment.', 'Nate Johnston'],
  [14, 'fade', 'Degradado de salón', 'Barbershop fade', 'Perfil definido durante el servicio.', 'Defined profile during a haircut.', 'Salah Regouane'],
  [15, 'textured', 'Textura controlada', 'Controlled texture', 'Detalle del trabajo de textura a tijera.', 'Detail of scissor texturing work.', 'Gulom Nazarov'],
  [16, 'fade', 'Degradado suave', 'Soft fade', 'Transición corta con textura superior.', 'A short transition with texture on top.', 'Michael DeMoya'],
  [17, 'classic', 'Infantil corto', 'Short kids’ cut', 'Una referencia de corte corto y práctico.', 'A short, practical haircut inspiration.', 'Alexander Grey'],
  [18, 'textured', 'Rizos infantiles', 'Kids’ curls', 'Movimiento natural para cabello rizado.', 'Natural movement for curly hair.', 'mohamad taheri'],
  [19, 'classic', 'Infantil de salón', 'Kids’ barbershop cut', 'Contornos cuidados y volumen moderado.', 'Careful edges and moderate volume.', 'Ibrahim guetar'],
  [20, 'classic', 'Infantil con raya', 'Kids’ side part', 'Peinado lateral de inspiración clásica.', 'Classic side-parted inspiration.', 'Tommy van Kessel'],
  [21, 'fade', 'Pequeño pompadour', 'Little pompadour', 'Volumen frontal y laterales cortos.', 'Front volume and short sides.', 'Stephen Walker'],
  [22, 'classic', 'Infantil a tijera', 'Kids’ scissor cut', 'Referencia de cuidado y acabado infantil.', 'Inspiration for a careful kids’ haircut finish.', 'Tommy van Kessel'],
  [23, 'textured', 'Flequillo natural', 'Natural fringe', 'Flequillo con textura y caída natural.', 'A textured fringe with a natural fall.', 'Kawê Rodrigues'],
  [24, 'textured', 'Texturizado juvenil', 'Youthful texture', 'Volumen suave y textura en la parte superior.', 'Soft volume and texture on top.', 'John Rodriguez'],
];
export const photoCatalog = entries.map(([number, style, es, en, descEs, descEn, author], index) => ({
  id: index === 0 ? 'fade' : `cut-${number}`,
  audience: number >= 17 ? 'kids' : 'men', style,
  name: { es, en }, description: { es: descEs, en: descEn },
  image: `assets/photos/cut-${String(number).padStart(2, '0')}.jpg`, author,
}));
