export const GENEROS_ESTANDAR = [
  'Novela',
  'Novela histórica',
  'Ciencia ficción y Distopía',
  'Fantasía',
  'Thriller y Negra',
  'Romance',
  'Ensayo y Divulgación',
  'Biografía y Memorias',
  'Cómic y Novela gráfica',
  'Poesía y Teatro',
  'Otros',
] as const

export function normalizarGenero(rawCategories?: string[] | null): string {
  if (!rawCategories || rawCategories.length === 0) return 'Otros'

  const texto = rawCategories.join(' ').toLowerCase()

  if (texto.includes('historical') || texto.includes('histórica') || texto.includes('history')) {
    return 'Novela histórica'
  }
  if (
    texto.includes('dystopian') ||
    texto.includes('science fiction') ||
    texto.includes('sci-fi') ||
    texto.includes('ciencia ficción')
  ) {
    return 'Ciencia ficción y Distopía'
  }
  if (texto.includes('fantasy') || texto.includes('fantasía')) {
    return 'Fantasía'
  }
  if (
    texto.includes('thriller') ||
    texto.includes('mystery') ||
    texto.includes('detective') ||
    texto.includes('crime') ||
    texto.includes('suspense') ||
    texto.includes('negra')
  ) {
    return 'Thriller y Negra'
  }
  if (texto.includes('romance')) {
    return 'Romance'
  }
  if (texto.includes('comic') || texto.includes('graphic novel') || texto.includes('manga')) {
    return 'Cómic y Novela gráfica'
  }
  if (texto.includes('biography') || texto.includes('autobiography') || texto.includes('memoir')) {
    return 'Biografía y Memorias'
  }
  if (texto.includes('poetry') || texto.includes('drama') || texto.includes('poesía')) {
    return 'Poesía y Teatro'
  }
  if (
    texto.includes('nonfiction') ||
    texto.includes('essay') ||
    texto.includes('philosophy') ||
    texto.includes('psychology') ||
    texto.includes('science') ||
    texto.includes('business') ||
    texto.includes('ensayo')
  ) {
    return 'Ensayo y Divulgación'
  }
  if (texto.includes('fiction') || texto.includes('novela') || texto.includes('literary')) {
    return 'Novela'
  }

  return 'Otros'
}

const CATALOGO_PREMIOS: { patron: RegExp; nombre: string }[] = [
  { patron: /nobel/i, nombre: 'Premio Nobel de Literatura' },
  { patron: /pulitzer/i, nombre: 'Premio Pulitzer' },
  { patron: /planeta/i, nombre: 'Premio Planeta' },
  { patron: /nadal/i, nombre: 'Premio Nadal' },
  { patron: /cervantes/i, nombre: 'Premio Cervantes' },
  { patron: /nacional de narrativa/i, nombre: 'Premio Nacional de Narrativa' },
  { patron: /herralde/i, nombre: 'Premio Herralde' },
  { patron: /alfaguara/i, nombre: 'Premio Alfaguara' },
  { patron: /biblioteca breve/i, nombre: 'Premio Biblioteca Breve' },
  { patron: /booker/i, nombre: 'Booker Prize' },
  { patron: /national book award/i, nombre: 'National Book Award' },
  { patron: /hugo award|premio hugo/i, nombre: 'Premio Hugo' },
  { patron: /nebula award|premio nébula|premio nebula/i, nombre: 'Premio Nébula' },
  { patron: /goncourt/i, nombre: 'Premio Goncourt' },
  { patron: /strega/i, nombre: 'Premio Strega' },
  { patron: /princesa de asturias|príncipe de asturias/i, nombre: 'Premio Princesa de Asturias' },
]

export function extraerPremios(
  rawCategories?: string[] | null,
  sinopsis?: string | null
): string | null {
  const fuente = `${(rawCategories || []).join(' ')} ${sinopsis || ''}`.trim()
  if (!fuente) return null

  const encontrados: string[] = []
  for (const { patron, nombre } of CATALOGO_PREMIOS) {
    if (patron.test(fuente) && !encontrados.includes(nombre)) {
      encontrados.push(nombre)
    }
  }

  return encontrados.length > 0 ? encontrados.join(' · ') : null
}