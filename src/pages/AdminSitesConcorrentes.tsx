import ClientLayout from "@/components/ClientLayout";
import SitesCatalogoPanel from "@/components/repricing/SitesCatalogoPanel";

const AdminSitesConcorrentes = () => (
  <ClientLayout>
    <div className="p-4 md:p-6 space-y-5 max-w-[1400px] mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Catálogo de Sites</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Cada site é coletado uma única vez e serve a todos os clientes que o acompanham.
        </p>
      </div>
      <SitesCatalogoPanel />
    </div>
  </ClientLayout>
);

export default AdminSitesConcorrentes;
