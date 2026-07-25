import "./globals.css";

const title = "Matheus Libonatti | Engenheiro de Software";
const description =
  "Engenharia de software para transformar ideias em produtos digitais rápidos, seguros e preparados para crescer.";

export const metadata = {
  metadataBase: new URL("https://matheus-libonatti.openai.site"),
  title,
  description,
  keywords: [
    "Matheus Libonatti",
    "engenheiro de software",
    "desenvolvimento de software",
    "sistemas web",
    "APIs",
    "automação",
    "consultoria de tecnologia"
  ],
  authors: [{ name: "Matheus Libonatti" }],
  creator: "Matheus Libonatti",
  openGraph: {
    title,
    description,
    type: "website",
    locale: "pt_BR",
    siteName: "Matheus Libonatti"
  },
  twitter: {
    card: "summary_large_image",
    title,
    description
  },
  alternates: {
    canonical: "/"
  }
};

export default function RootLayout({ children }) {
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: "Matheus Libonatti",
    jobTitle: "Engenheiro de Software",
    url: "https://matheus-libonatti.openai.site",
    sameAs: ["https://github.com/Libonatti93"],
    knowsAbout: [
      "Engenharia de Software",
      "Desenvolvimento Web",
      "APIs",
      "Arquitetura de Software",
      "Automação"
    ]
  };

  return (
    <html lang="pt-BR">
      <body>
        {children}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
      </body>
    </html>
  );
}
