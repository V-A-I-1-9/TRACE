import { captureRequest } from '@/lib/capture'

export function POST(request: Request) {
  return captureRequest(request, 'DOCUMENT')
}
