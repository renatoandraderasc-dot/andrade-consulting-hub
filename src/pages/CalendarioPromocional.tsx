import ClientLayout from "@/components/ClientLayout";
import CalendarioPromocionalTab from "@/components/encarte-sugestao/CalendarioPromocionalTab";

const CalendarioPromocional = () => {
  const storeId = sessionStorage.getItem("selectedStoreId") || "";
  return (
    <ClientLayout>
      <div className="w-full px-4 md:px-6 py-6">
        <CalendarioPromocionalTab storeId={storeId} />
      </div>
    </ClientLayout>
  );
};
export default CalendarioPromocional;
