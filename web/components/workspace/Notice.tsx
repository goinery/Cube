export default function Notice({message}: {message: string | null | undefined}) {
  return message ? <output className="toast" aria-live="polite">{message}</output> : null;
}
