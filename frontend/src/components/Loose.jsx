import React from "react";
import rickmortyloose from "@assets/Images/rickandmortyloose.gif";

export default function Loose({ namePaysLoose }) {
  return (
    <div
      className="modale"
      aria-labelledby="modal-title"
      role="dialog"
      aria-modal="true"
    >
      <div className="fixed z-100000 inset-0 bg-gray-500 bg-opacity-75 transition-opacity" />

      <div className="fixed z-100000 inset-0 overflow-y-auto">
        <div className="flex items-center justify-center min-h-full p-4 text-center sm:p-0">
          <div className="relative center bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:max-w-lg sm:w-full">
            <div className="bg-white center px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
              <div className="namepaysloose">
                {" "}
                Oh non! tu t' es trompé,la réponse était {namePaysLoose}
                <div className="mx-auto center flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-red-100 sm:mx-0 sm:h-10 sm:w-10">
                  <img
                    className="imageloose top-200 z-10000 absolute"
                    src={rickmortyloose}
                    alt="perduu c'est ..."
                  />
                </div>
              </div>
            </div>
            <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse" />
          </div>
        </div>
      </div>
    </div>
  );
}
