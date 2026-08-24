import ClienteConcorrentesPanel from "./ClienteConcorrentesPanel";

const ConcorrentesTab = ({ storeId }: { storeId: string }) => (
  <ClienteConcorrentesPanel storeId={storeId} />
);

export default ConcorrentesTab;
