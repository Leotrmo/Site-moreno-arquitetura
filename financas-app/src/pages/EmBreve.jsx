// Placeholder reutilizável para as telas que serão preenchidas nos Planos 5 e 6.
export default function EmBreve({ titulo, children }) {
  return (
    <section>
      <h1 className="text-xl font-bold text-slate-800 mb-2">{titulo}</h1>
      <div className="text-slate-500">{children ?? 'Em breve.'}</div>
    </section>
  );
}
