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

export const GENEROS_EXLIBRIS = GENEROS_ESTANDAR

export function normalizarGenero(
  categoriasApi?: string[] | null,
  sinopsis?: string | null,
  titulo?: string | null
): string {
  const cats = (categoriasApi || []).join(' ').toLowerCase()
  const texto = `${cats} ${titulo || ''} ${sinopsis || ''}`.toLowerCase()

  if (/comic|graphic novel|manga|cómic|novela gr[aá]fica|historieta/.test(cats)) {
    return 'Cómic y Novela gráfica'
  }
  if (/poetry|drama|poes[ií]a|teatro|poema [eé]pico/.test(cats)) {
    return 'Poesía y Teatro'
  }
  if (/biography|autobiography|memoir|biograf[ií]a|memorias|diario personal/.test(cats)) {
    return 'Biografía y Memorias'
  }
  if (
    /science|philosophy|psychology|history|social science|self-help|business|essays|ensayo|divulgaci[oó]n|neurociencia|evoluci[oó]n/.test(
      cats
    )
  ) {
    return 'Ensayo y Divulgación'
  }
  if (
    /thriller|crime|mystery|detective|suspense|noir|negra|polic[ií]ac|asesinato|inspector|comisario|secuestro/.test(
      texto
    )
  ) {
    return 'Thriller y Negra'
  }
  if (
    /science fiction|dystopia|cyberpunk|ciencia ficci[oó]n|distop[ií]a|espacial|galaxia|totalitari/.test(
      texto
    )
  ) {
    return 'Ciencia ficción y Distopía'
  }
  if (/fantasy|magic|fantas[ií]a|magia|drag[oó]n|inmortal/.test(texto)) {
    return 'Fantasía'
  }
  if (/historical|hist[oó]rica|guerra civil|siglo xix|siglo xviii|posguerra/.test(texto)) {
    return 'Novela histórica'
  }
  if (/romance|love stories|rom[aá]ntic|pasi[oó]n amorosa/.test(cats)) {
    return 'Romance'
  }
  if (/fiction|novel|novela|narrativa|literatura|relatos/.test(texto)) {
    return 'Novela'
  }

  return 'Otros'
}