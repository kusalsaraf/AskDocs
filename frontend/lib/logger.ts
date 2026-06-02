const isProd = process.env.NODE_ENV === 'production'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LogFn = (...args: any[]) => void
const noop: LogFn = () => {}

export const logger = {
  log:   isProd ? noop : console.log.bind(console),
  warn:  isProd ? noop : console.warn.bind(console),
  error: isProd ? noop : console.error.bind(console),
}
