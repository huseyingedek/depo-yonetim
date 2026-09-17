import PageHeader from "../../components/PageHeader";

export default function BarcodeGeneratorPage() {
  return (
    <div className="mx-auto max-w-5xl p-4 lg:p-8">
      <PageHeader
        title="Barkod Oluşturma"
        subtitle="Bu modül üzerinde çalışılacak"
        backTo="/label-printing"
      />
    </div>
  );
}
