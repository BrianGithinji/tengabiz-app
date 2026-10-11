export async function readJsonResponse<T>(res: Response): Promise<T> {
  const text = await res.text()

  if (!text.trim()) {
    throw new Error(`Request failed (${res.status}): The server returned an empty response.`)
  }

  try {
    return JSON.parse(text) as T
  } catch {
    throw new Error(`Request failed (${res.status}): The server returned an invalid response.`)
  }
}
