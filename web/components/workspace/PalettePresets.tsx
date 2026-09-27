interface Palette {
  name: string;
  colors: Readonly<Record<string, string>> | readonly string[];
}

export default function PalettePresets<P extends Palette>({
  palettes,
  onSelect,
  disabled,
}: {
  palettes: readonly P[];
  onSelect: (palette: P) => void;
  disabled?: boolean;
}) {
  return (
    <div className="palette-presets">
      {palettes.map((palette) => (
        <button
          type="button"
          key={palette.name}
          disabled={disabled}
          onClick={() => onSelect(palette)}
        >
          <span
            aria-hidden="true"
            style={{
              gridTemplateColumns: `repeat(${Math.min(6, Object.keys(palette.colors).length)}, 8px)`,
            }}
          >
            {Object.entries(palette.colors).map(([face, color]) => (
              <i key={face} style={{ background: color }} />
            ))}
          </span>
          {palette.name}
        </button>
      ))}
    </div>
  );
}
