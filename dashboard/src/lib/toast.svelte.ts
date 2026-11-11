// One message at a time at the top of the page, like the phone app's snackbar.
let message = $state<{ text: string; error: boolean; id: number } | null>(null)
let timer: ReturnType<typeof setTimeout> | undefined

export const toast = {
  get current() {
    return message
  },
  show(text: string, error = false) {
    message = { text, error, id: Date.now() }
    clearTimeout(timer)
    timer = setTimeout(() => (message = null), error ? 6000 : 3000)
  },
  hide() {
    message = null
  },
}
