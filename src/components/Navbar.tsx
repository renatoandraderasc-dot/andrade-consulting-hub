import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X } from "lucide-react";
import { Link } from "react-router-dom";
import andradeLogo from "@/assets/andrade-logo.png";

const links = [
  { href: "#servicos", label: "Serviços", isRoute: false },
  { href: "#sobre", label: "Sobre", isRoute: false },
  { href: "#contato", label: "Contato", isRoute: false },
  { href: "/checklist", label: "Clientes", isRoute: true },
];

const Navbar = () => {
  const [open, setOpen] = useState(false);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b border-border">
      <div className="container mx-auto px-6 h-16 flex items-center justify-between">
        <a href="#" className="flex items-center gap-2">
          <img src={andradeLogo} alt="Andrade Logo" className="h-10" />
        </a>

        <div className="hidden md:flex items-center gap-8">
          {links.map((link) =>
            link.isRoute ? (
              <Link
                key={link.href}
                to={link.href}
                className="text-muted-foreground hover:text-foreground font-body text-sm transition-colors"
              >
                {link.label}
              </Link>
            ) : (
              <a
                key={link.href}
                href={link.href}
                className="text-muted-foreground hover:text-foreground font-body text-sm transition-colors"
              >
                {link.label}
              </a>
            )
          )}
          <a
            href="#contato"
            className="bg-gradient-gold text-primary-foreground font-body font-semibold px-5 py-2 rounded-lg text-sm hover:opacity-90 transition-opacity"
          >
            Fale Conosco
          </a>
        </div>

        <button
          onClick={() => setOpen(!open)}
          className="md:hidden text-foreground"
        >
          {open ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden bg-background border-b border-border overflow-hidden"
          >
            <div className="container mx-auto px-6 py-4 flex flex-col gap-4">
              {links.map((link) =>
                link.isRoute ? (
                  <Link
                    key={link.href}
                    to={link.href}
                    onClick={() => setOpen(false)}
                    className="text-muted-foreground hover:text-foreground font-body text-sm"
                  >
                    {link.label}
                  </Link>
                ) : (
                  <a
                    key={link.href}
                    href={link.href}
                    onClick={() => setOpen(false)}
                    className="text-muted-foreground hover:text-foreground font-body text-sm"
                  >
                    {link.label}
                  </a>
                )
              )}
              <a
                href="#contato"
                onClick={() => setOpen(false)}
                className="bg-gradient-gold text-primary-foreground font-body font-semibold px-5 py-2 rounded-lg text-sm text-center hover:opacity-90 transition-opacity"
              >
                Fale Conosco
              </a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
};

export default Navbar;
