const fieldKeys: Record<string, string> = {
  empty: 'trips.fields.empty',
  too_long: 'trips.fields.too_long',
  before_start: 'trips.fields.before_start',
  min_greater_than_max: 'trips.fields.min_greater_than_max',
  invalid: 'trips.fields.invalid',
  invalid_date: 'trips.fields.invalid_date',
  required: 'trips.fields.required',
}

export function fieldMessage(t: (key: string) => string, code: string): string {
  const key = fieldKeys[code]
  return key ? t(key) : t('trips.errors.save')
}
