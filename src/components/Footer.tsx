import andradeLogo from "@/assets/andrade-logo.png";

const Footer = () => {
  return (
    <footer className="py-10 bg-card border-t border-border">
      <div className="container mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
        <img src={andradeLogo} alt="Andrade Logo" className="h-12" />
        <div className="text-center md:text-right">
          <p className="text-muted-foreground font-body text-sm font-semibold">Renato Andrade Silva Cunha</p>
          <p className="text-muted-foreground font-body text-sm">
            © {new Date().getFullYear()} Andrade Consultoria. Todos os direitos
            reservados.
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
