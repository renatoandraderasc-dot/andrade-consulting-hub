import andradeLogo from "@/assets/andrade-logo.png";
import { useSiteContent } from "@/hooks/useSiteContent";

const Footer = () => {
  const { content } = useSiteContent();
  return (
    <footer className="py-10 bg-card border-t border-border">
      <div className="container mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
        <img src={andradeLogo} alt="Andrade Logo" className="h-12" />
        <div className="text-center md:text-right">
          <p className="text-muted-foreground font-body text-sm font-semibold">{content.footer.owner}</p>
          <p className="text-muted-foreground font-body text-sm">
            © {new Date().getFullYear()} {content.footer.rights}
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
