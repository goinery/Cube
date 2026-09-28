export function download(value: unknown, name: string) {
  const url = URL.createObjectURL(
      new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }),
    ),
    a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
