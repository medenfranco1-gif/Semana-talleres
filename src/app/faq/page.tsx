import Link from "next/link";

export const metadata = { title: "Preguntas frecuentes · Escuela Leonardo Da Vinci" };

const FAQS = [
  {
    q: "¿Cómo me inscribo a un taller?",
    a: "Creá tu cuenta en 'Registrarse', entrá al catálogo, elegí el día y tocá 'Inscribirme' en el taller que quieras. Te va a pedir confirmar antes de anotarte.",
  },
  {
    q: "¿Cuántos talleres puedo elegir?",
    a: "Uno por franja horaria por día. No te podés anotar a dos talleres que se superpongan en horario, ni a dos de la misma categoría el mismo día.",
  },
  {
    q: "¿Puedo darme de baja de un taller?",
    a: "No. Una vez confirmada la inscripción, queda fija. Elegí con cuidado antes de confirmar.",
  },
  {
    q: "¿Qué pasa si el taller se llena?",
    a: "El sistema bloquea la inscripción cuando se alcanza el cupo máximo y muestra 'Cupo completo'. Los cupos se actualizan en tiempo real.",
  },
  {
    q: "¿Cómo veo en qué talleres quedé?",
    a: "Entrá a 'Mi itinerario' desde la barra de arriba. Ahí ves todos los talleres en los que estás inscripto.",
  },
  {
    q: "¿Las inscripciones están siempre abiertas?",
    a: "No. La dirección del colegio habilita y deshabilita las inscripciones por día. Si están cerradas, vas a ver un cartel avisándolo.",
  },
  {
    q: "¿Qué hago si me olvido la contraseña?",
    a: "Podés recuperarla vos mismo por email. En la página de login, hacé click en '¿Olvidaste tu contraseña? Recuperarla por email', poné tu email y te va a llegar un link para cambiarla. Si no te llega o tenés problemas, pedile ayuda a un profesor o a la dirección.",
  },
];

export default function FAQPage() {
  return (
    <div className="container-app py-10 sm:py-16">
      <div className="mx-auto max-w-2xl">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            Preguntas frecuentes
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Todo lo que necesitás saber para inscribirte a la Semana de Talleres.
          </p>
        </div>

        <div className="space-y-3">
          {FAQS.map((f, i) => (
            <details
              key={i}
              className="card group p-4 [&_summary::-webkit-details-marker]:hidden"
            >
              <summary className="flex cursor-pointer items-center justify-between gap-3 font-medium text-slate-900">
                <span>{f.q}</span>
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand-100 text-brand-700 transition group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-slate-600">{f.a}</p>
            </details>
          ))}
        </div>

        <div className="mt-8 text-center">
          <Link href="/" className="btn-secondary">
            Volver al inicio
          </Link>
        </div>
      </div>
    </div>
  );
}
