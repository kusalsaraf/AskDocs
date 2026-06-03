/**
 * Centralised logger — keeps `error` and `warn` active in production
 * (essential for debugging), suppresses verbose `log` output.
 */
const isProd = process.env.NODE_ENV === 'production'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LogFn = (...args: any[]) => void
const noop: LogFn = () => {}

export const logger = {
  log:   isProd ? noop : console.log.bind(console),
  warn:  console.warn.bind(console),
  error: console.error.bind(console),
}
