const Footer = () => {
  return (
    <footer className="py-10 bg-card border-t border-border">
      <div className="container mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
        <p className="font-display text-xl font-bold">
          Andrade <span className="text-gradient-gold">Consultoria</span>
        </p>
        <p className="text-muted-foreground font-body text-sm">
          © {new Date().getFullYear()} Andrade Consultoria. Todos os direitos
          reservados.
        </p>
      </div>
    </footer>
  );
};

export default Footer;
